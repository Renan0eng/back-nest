import { IsArray, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignStage } from '@prisma/client';

export class CampaignDto {
  @IsString() title!: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(CampaignStage) @IsOptional() stage?: CampaignStage;
  @IsDateString() @IsOptional() scheduledAt?: string;
  @IsString() @IsOptional() imageUrl?: string;
  @IsString() @IsOptional() emailSubject?: string;
  @IsString() @IsOptional() emailBody?: string;
  @IsArray() @IsOptional() supplyItems?: Array<{ supplyId: string; expectedQuantity: number; campaignEnd: string }>;
}
