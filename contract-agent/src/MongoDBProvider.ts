import {
  Collection,
  Db,
  Document,
  WithId,
  InsertOneResult,
  MongoClient,
  ObjectId,
} from 'mongodb';
import { DataProvider } from './DataProvider';
import {
  FilterOperator,
  SearchCriteria,
  FilterCondition,
  DataProviderConfig,
} from './types';
import { Logger } from './Logger';

type DocumentChangeHandler = (collectionName: string, document: any) => void;

class MongoInterceptor {
  private static instance: MongoInterceptor;
  private callbacks: Map<string, DocumentChangeHandler[]>;

  private constructor() {
    this.callbacks = new Map();
    ['insert', 'update', 'delete'].forEach((op) => {
      this.callbacks.set(op, []);
    });
  }

  static getInstance(): MongoInterceptor {
    if (!MongoInterceptor.instance) {
      MongoInterceptor.instance = new MongoInterceptor();
    }
    return MongoInterceptor.instance;
  }

  public addCallback(
    changeType: string,
    callback: DocumentChangeHandler,
  ): void {
    const callbacks = this.callbacks.get(changeType) || [];
    callbacks.push(callback);
    this.callbacks.set(changeType, callbacks);
  }

  public notifyCallbacks(
    changeType: string,
    collectionName: string,
    document: any,
  ): void {
    const callbacks = this.callbacks.get(changeType) || [];
    callbacks.forEach((callback) => callback(collectionName, document));
  }
}

export class MongoDBProvider extends DataProvider {
  private static connections: Map<
    string,
    { db: Db; client: MongoClient } | undefined
  > = new Map();
  private db?: Db;
  private client?: MongoClient;
  private collection!: Collection<Document>;
  private dbName: string;
  private connectionPromise?: Promise<Db>;

  constructor(config: DataProviderConfig) {
    super(config.source);
    this.dbName = config.dbName;
    this.connectionPromise = this.connectToDatabase(config.url);
  }

  private async connectToDatabase(url: string): Promise<Db> {
    if (!url) {
      throw new Error('Database URL is required');
    }

    const connectionKey = `${url}:${this.dbName}`;
    const existingConnection = MongoDBProvider.connections.get(connectionKey);
    if (existingConnection) {
      Logger.info('Reusing existing MongoDB connection');
      this.db = existingConnection.db;
      this.client = existingConnection.client;
      return this.db;
    }

    try {
      const client = await MongoClient.connect(url);
      const db = client.db(this.dbName);

      Logger.info('MongoDB connected successfully');
      this.db = db;
      this.client = client;

      MongoDBProvider.connections.set(connectionKey, { db, client });
      return db;
    } catch (error) {
      Logger.error(`Error connecting to MongoDB: ${(error as Error).message}`);
      throw error;
    }
  }

  public static async disconnectFromDatabase(
    url: string,
    dbName: string,
  ): Promise<void> {
    const connectionKey = `${url}:${dbName}`;
    const existingConnection = MongoDBProvider.connections.get(connectionKey);

    if (existingConnection) {
      try {
        await existingConnection.client.close();
        MongoDBProvider.connections.set(connectionKey, undefined);
        Logger.info(`MongoDB connection for ${connectionKey} closed`);
      } catch (error) {
        Logger.error(`Error during disconnect: ${(error as Error).message}`);
      }
    } else {
      Logger.warn(`No active connection found for ${connectionKey}`);
    }
  }

  async ensureReady(): Promise<void> {
    await this.connectionPromise;
    this.collection = MongoDBProvider.createCollectionProxy(
      this.db!.collection(this.dataSource),
    );
    this.setupCallbacks();
  }

  private static createCollectionProxy(collection: Collection): Collection {
    const interceptor = MongoInterceptor.getInstance();
    const handler = {
      get(target: Collection, prop: string | symbol): any {
        const original = target[prop as keyof Collection];
        if (typeof original !== 'function') return original;

        const nonAsyncMethods = ['find', 'aggregate'];

        if (nonAsyncMethods.includes(prop as string)) {
          return function (this: Collection, ...args: any[]) {
            return (original as Function).call(target, ...args);
          };
        }

        return async function (this: any, ...args: any[]) {
          const method = original as (...args: any[]) => Promise<any>;
          const result = await method.apply(target, args);

          if (prop === 'insertOne') {
            interceptor.notifyCallbacks('insert', collection.collectionName, {
              fullDocument: args[0],
              insertedId: result.insertedId,
              acknowledged: result.acknowledged,
            });
          } else if (prop === 'insertMany') {
            interceptor.notifyCallbacks('insert', collection.collectionName, {
              fullDocuments: args[0],
              insertedIds: result.insertedIds,
              acknowledged: result.acknowledged,
            });
          } else if (prop === 'updateOne' || prop === 'updateMany') {
            interceptor.notifyCallbacks('update', collection.collectionName, {
              filter: args[0],
              update: args[1],
              result,
            });
          } else if (prop === 'deleteOne' || prop === 'deleteMany') {
            interceptor.notifyCallbacks('delete', collection.collectionName, {
              filter: args[0],
              result,
            });
          }

          return result;
        };
      },
    };

    return new Proxy(collection, handler);
  }

  private setupCallbacks(): void {
    const interceptor = MongoInterceptor.getInstance();

    interceptor.addCallback('insert', (collectionName, data) => {
      if (collectionName === this.dataSource) {
        this.notifyDataChange('dataInserted', {
          fullDocument: data.fullDocument,
          fullDocuments: data.fullDocuments,
          source: this.dataSource,
        });
      }
    });

    interceptor.addCallback('update', (collectionName, data) => {
      if (collectionName === this.dataSource) {
        this.notifyDataChange('dataUpdated', {
          documentKey: { _id: data.filter._id },
          updateDescription: { updatedFields: data.update.$set || {} },
          source: this.dataSource,
        });
      }
    });

    interceptor.addCallback('delete', (collectionName, data) => {
      if (collectionName === this.dataSource) {
        this.notifyDataChange('dataDeleted', {
          documentKey: { _id: data.filter._id },
          source: this.dataSource,
        });
      }
    });
  }

  protected makeQuery(conditions: FilterCondition[]): Record<string, any> {
    return conditions.reduce((query, condition) => {
      switch (condition.operator) {
        case FilterOperator.IN:
          return {
            ...query,
            [condition.field]: { $in: condition.value },
          };
        case FilterOperator.EQUALS:
          return {
            ...query,
            [condition.field]: condition.value,
          };
        case FilterOperator.GT:
          return {
            ...query,
            [condition.field]: { $gt: condition.value },
          };
        case FilterOperator.LT:
          return {
            ...query,
            [condition.field]: { $lt: condition.value },
          };
        case FilterOperator.CONTAINS:
          return {
            ...query,
            [condition.field]: {
              $in: Array.isArray(condition.value)
                ? condition.value
                : [condition.value],
            },
          };
        case FilterOperator.REGEX:
          return {
            ...query,
            [condition.field]: {
              $in: Array.isArray(condition.value)
                ? condition.value.map((val) => new RegExp(val, 'i'))
                : [new RegExp(condition.value, 'i')],
            },
          };
        default:
          throw new Error(`Unsupported operator: ${condition.operator}`);
      }
    }, {});
  }

  async create(data: Document): Promise<WithId<Document>> {
    try {
      const result: InsertOneResult<Document> =
        await this.collection.insertOne(data);
      if (!result.acknowledged) {
        throw new Error('Document insertion was not acknowledged');
      }
      return { ...data, _id: result.insertedId };
    } catch (error) {
      Logger.info(
        `Error during document insertion: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.collection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        Logger.warn(`No document found with id: ${id}`);
        return false;
      }

      Logger.info(`Document with id: ${id} successfully deleted`);
      return true;
    } catch (error) {
      Logger.error(
        `Error during document deletion: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async find(criteria: SearchCriteria): Promise<[]> {
    const query = this.makeQuery(criteria.conditions);
    const data = (await this.collection
      .find(query)
      .limit(criteria.limit || 0)
      .toArray()) as [];
    return data;
  }
}
