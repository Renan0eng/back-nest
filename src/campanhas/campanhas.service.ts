import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampanhasService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.campaign.findMany({ orderBy: [{ stage: 'asc' }, { updatedAt: 'desc' }], include: { supplies: { include: { supply: true } } } }); }
  async create(dto: CampaignDto, userId: string) {
    const { supplyItems, ...data } = dto;
    await this.validateSupplyItems(supplyItems);
    return this.prisma.campaign.create({ data: { ...data, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined, createdById: userId, supplies: supplyItems?.length ? { create: supplyItems.map(i => ({ supplyId: i.supplyId, expectedQuantity: Number(i.expectedQuantity), campaignEnd: new Date(i.campaignEnd) })) } : undefined }, include: { supplies: true } });
  }
  async update(id: string, dto: CampaignDto) {
    if (!await this.prisma.campaign.findUnique({ where: { id } })) throw new NotFoundException('Campanha não encontrada.');
    const { supplyItems, ...data } = dto;
    await this.validateSupplyItems(supplyItems);
    return this.prisma.$transaction(async tx => { await tx.campaignSupply.deleteMany({ where: { campaignId: id } }); return tx.campaign.update({ where: { id }, data: { ...data, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined, supplies: supplyItems?.length ? { create: supplyItems.map(i => ({ supplyId: i.supplyId, expectedQuantity: Number(i.expectedQuantity), campaignEnd: new Date(i.campaignEnd) })) } : undefined }, include: { supplies: true } }) });
  }
  private async validateSupplyItems(items?: Array<{ supplyId: string; expectedQuantity: number; campaignEnd: string }>) {
    for (const item of items || []) {
      const supply = await this.prisma.supply.findFirst({ where: { id: item.supplyId, deletedAt: null } });
      if (!supply) throw new NotFoundException('Insumo da campanha não encontrado.');
      if (Number(item.expectedQuantity) < 0) throw new BadRequestException('O consumo previsto não pode ser negativo.');
      if (supply.expiresAt && supply.expiresAt < new Date(item.campaignEnd)) throw new BadRequestException(`A validade de ${supply.name} termina antes do fim da campanha.`);
    }
  }
  async remove(id: string) { await this.prisma.campaign.delete({ where: { id } }); return { message: 'Campanha removida.' }; }
}
