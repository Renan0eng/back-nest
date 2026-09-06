import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Collection, Db, Document, Filter, MongoClient, ObjectId } from 'mongodb';
import { PrismaService } from 'src/database/prisma.service';

export type LogExclusionRuleInput = { name: string; routeContains?: string; messageContains?: string; userId?: string; statusCode?: number; olderThanDays?: number; enabled?: boolean };

@Injectable()
export class LogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  private client?: MongoClient;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  private async database(): Promise<Db> {
    const uri = process.env.MONGODB_URL;
    if (!uri) throw new Error('MONGODB_URL não foi configurada para os logs.');
    if (!this.client) { this.client = new MongoClient(uri); await this.client.connect(); }
    return this.client.db(process.env.MONGODB_DATABASE || 'prefeitura');
  }
  private async logs(): Promise<Collection<Document>> { return (await this.database()).collection('error_logs'); }
  private async rules(): Promise<Collection<Document>> { return (await this.database()).collection('log_exclusion_rules'); }

  async onModuleInit() {
    try {
      const logs = await this.logs();
      await Promise.all([logs.createIndex({ createdAt: -1 }), logs.createIndex({ statusCode: 1, createdAt: -1 }), logs.createIndex({ userId: 1, createdAt: -1 }), (await this.rules()).createIndex({ enabled: 1 })]);
      await this.migrateLegacyPostgresLogs();
      this.scheduleDailyCleanup();
    } catch (error) { this.logger.error(`Não foi possível iniciar os logs no MongoDB: ${(error as Error).message}`); }
  }
  async onModuleDestroy() { if (this.cleanupTimer) clearTimeout(this.cleanupTimer); await this.client?.close(); }

  private scheduleDailyCleanup() {
    const nowInBrazil = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const nextRun = new Date(nowInBrazil); nextRun.setHours(3, 15, 0, 0);
    if (nextRun <= nowInBrazil) nextRun.setDate(nextRun.getDate() + 1);
    this.cleanupTimer = setTimeout(async () => {
      try { const result = await this.applyExclusionRules(); this.logger.log(`Limpeza diária: ${result.deletedCount} log(s) removido(s).`); }
      catch (error) { this.logger.error(`Falha na limpeza diária: ${(error as Error).message}`); }
      finally { this.scheduleDailyCleanup(); }
    }, nextRun.getTime() - nowInBrazil.getTime());
  }
  private escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /** Importa o histórico PostgreSQL apenas uma vez; a escrita corrente ocorre somente no MongoDB. */
  private async migrateLegacyPostgresLogs() {
    const db = await this.database();
    const migration = db.collection('log_migrations');
    if (await migration.findOne({ key: 'postgres-error-logs-v1' })) return;
    const legacyLogs = await this.prisma.errorLog.findMany({ orderBy: { createdAt: 'asc' } });
    if (legacyLogs.length) {
      await (await this.logs()).insertMany(legacyLogs.map(({ id, ...log }) => ({ ...log, legacyId: id })));
      this.logger.log(`${legacyLogs.length} log(s) históricos migrados do PostgreSQL para o MongoDB.`);
    }
    await migration.insertOne({ key: 'postgres-error-logs-v1', completedAt: new Date(), count: legacyLogs.length });
  }
  private buildFilter(opts: Record<string, any>): Filter<Document> {
    const where: Filter<Document> = {};
    if (opts.userId) where.userId = opts.userId;
    if (opts.route) where.route = { $regex: this.escapeRegex(opts.route), $options: 'i' };
    if (opts.method) where.method = opts.method.toUpperCase();
    if (opts.statusCode !== undefined && Number.isFinite(opts.statusCode)) where.statusCode = opts.statusCode;
    if (typeof opts.seen === 'boolean') where.seen = opts.seen;
    if (opts.createdFrom || opts.createdTo) {
      const createdAt: Record<string, Date> = {};
      if (opts.createdFrom && !Number.isNaN(new Date(opts.createdFrom).getTime())) createdAt.$gte = new Date(`${opts.createdFrom}T00:00:00.000-03:00`);
      if (opts.createdTo && !Number.isNaN(new Date(opts.createdTo).getTime())) createdAt.$lte = new Date(`${opts.createdTo}T23:59:59.999-03:00`);
      if (Object.keys(createdAt).length) where.createdAt = createdAt;
    }
    if (opts.search?.trim()) { const search = { $regex: this.escapeRegex(opts.search.trim()), $options: 'i' }; where.$or = [{ message: search }, { route: search }, { userEmail: search }, { ip: search }]; }
    return where;
  }

  async create(log: Record<string, unknown>) { const result = await (await this.logs()).insertOne({ ...log, seen: false, createdAt: new Date() }); return { id: result.insertedId.toString() }; }
  async findAll(opts: Record<string, any>) {
    const page = Math.max(1, Number(opts.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20)); const where = this.buildFilter(opts); const collection = await this.logs();
    const [total, data] = await Promise.all([collection.countDocuments(where), collection.find(where).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray()]);
    return { total, page, pageSize, data: data.map(this.serialize) };
  }
  async findOne(id: string) { const log = await (await this.logs()).findOne({ _id: this.objectId(id) }); if (!log) throw new BadRequestException('Log não encontrado.'); return this.serialize(log); }
  async markAsSeen(id: string) { const result = await (await this.logs()).findOneAndUpdate({ _id: this.objectId(id) }, [{ $set: { seen: { $not: '$seen' } } }], { returnDocument: 'after' }); if (!result) throw new BadRequestException('Log não encontrado.'); return { id, seen: result.seen }; }

  async analytics(opts: Record<string, any>) {
    const where = this.buildFilter(opts); const collection = await this.logs();
    const [total, unseen, statuses, methods, routes, days] = await Promise.all([
      collection.countDocuments(where), collection.countDocuments({ ...where, seen: false }),
      collection.aggregate([{ $match: where }, { $group: { _id: { $ifNull: ['$statusCode', 0] }, value: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
      collection.aggregate([{ $match: where }, { $group: { _id: { $ifNull: ['$method', 'N/D'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }]).toArray(),
      collection.aggregate([{ $match: where }, { $group: { _id: { $ifNull: ['$route', 'N/D'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }, { $limit: 6 }]).toArray(),
      collection.aggregate([{ $match: where }, { $group: { _id: { $dateToString: { format: '%d/%m', date: '$createdAt', timezone: 'America/Sao_Paulo' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    ]);
    return { total, unseen, statuses: statuses.map((x) => ({ statusCode: x._id, value: x.value })), methods: methods.map((x) => ({ method: x._id, value: x.value })), routes: routes.map((x) => ({ route: x._id, value: x.value })), days: days.map((x) => ({ date: x._id, count: x.count })) };
  }
  async listRules() { return (await (await this.rules()).find().sort({ createdAt: -1 }).toArray()).map(this.serialize); }
  async createRule(input: LogExclusionRuleInput, createdBy?: string) {
    if (!input.name?.trim()) throw new BadRequestException('Informe um nome para a regra.');
    if (![input.routeContains, input.messageContains, input.userId, input.statusCode, input.olderThanDays].some((x) => x !== undefined && x !== '')) throw new BadRequestException('Defina ao menos um critério para a regra.');
    if (input.olderThanDays !== undefined && (!Number.isInteger(input.olderThanDays) || input.olderThanDays < 1)) throw new BadRequestException('A idade mínima deve ser maior que zero.');
    const document = { ...input, name: input.name.trim(), enabled: input.enabled ?? true, createdBy, createdAt: new Date(), updatedAt: new Date() }; const result = await (await this.rules()).insertOne(document); return { ...this.serialize(document), id: result.insertedId.toString() };
  }
  async updateRule(id: string, input: Partial<LogExclusionRuleInput>) { const result = await (await this.rules()).findOneAndUpdate({ _id: this.objectId(id) }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: 'after' }); if (!result) throw new BadRequestException('Regra não encontrada.'); return this.serialize(result); }
  async deleteRule(id: string) { const result = await (await this.rules()).deleteOne({ _id: this.objectId(id) }); if (!result.deletedCount) throw new BadRequestException('Regra não encontrada.'); return { deleted: true }; }
  async applyExclusionRules() {
    const rules = await (await this.rules()).find({ enabled: true }).toArray(); let deletedCount = 0; const logs = await this.logs();
    for (const rule of rules) { const filter: Filter<Document> = {};
      if (rule.routeContains) filter.route = { $regex: this.escapeRegex(rule.routeContains), $options: 'i' }; if (rule.messageContains) filter.message = { $regex: this.escapeRegex(rule.messageContains), $options: 'i' }; if (rule.userId) filter.userId = rule.userId; if (typeof rule.statusCode === 'number') filter.statusCode = rule.statusCode; if (rule.olderThanDays) filter.createdAt = { $lt: new Date(Date.now() - rule.olderThanDays * 86_400_000) };
      deletedCount += (await logs.deleteMany(filter)).deletedCount;
    } return { deletedCount, rulesProcessed: rules.length };
  }
  private objectId(id: string) { if (!ObjectId.isValid(id)) throw new BadRequestException('Identificador inválido.'); return new ObjectId(id); }
  private serialize = (document: Document) => { const { _id, ...rest } = document; return { id: _id?.toString(), ...rest }; };
}
