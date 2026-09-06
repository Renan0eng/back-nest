import { SupplyMovementType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateSupplyDto {
    @IsString()
    @IsNotEmpty({ message: 'O nome do insumo é obrigatório.' })
    name: string;

    @IsString()
    @IsNotEmpty({ message: 'A unidade é obrigatória.' })
    unit: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    balance?: number;

    @IsInt()
    @Min(0)
    @IsOptional()
    minStock?: number;

    @IsString()
    @IsOptional()
    lot?: string;

    @IsDateString()
    @IsOptional()
    expiresAt?: string;

    @IsInt()
    @IsOptional()
    grupoId?: number;

    @IsInt()
    @IsOptional()
    supplyGroupId?: number;
}

export class UpdateSupplyDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    unit?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    minStock?: number;

    @IsString()
    @IsOptional()
    lot?: string;

    @IsDateString()
    @IsOptional()
    expiresAt?: string;

    @IsInt()
    @IsOptional()
    supplyGroupId?: number;
}

export class MovimentacaoDto {
    @IsEnum(SupplyMovementType, { message: 'Tipo deve ser Entrada ou Saida.' })
    type: SupplyMovementType;

    @IsInt()
    @Min(1, { message: 'A quantidade deve ser maior que zero.' })
    quantity: number;

    @IsString()
    @IsOptional()
    reason?: string;

    @IsString()
    @IsOptional()
    attendanceId?: string;

    @IsString()
    @IsOptional()
    lot?: string;

    @IsDateString()
    @IsOptional()
    expiresAt?: string;
}

export class UpdateSupplyGroupDto {
    @IsString() @IsOptional() name?: string;
    @IsString() @IsOptional() description?: string;
    @IsOptional() isCampaign?: boolean;
}
