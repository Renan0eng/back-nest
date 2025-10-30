import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { EnumUserType } from 'generated/prisma';

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsEmail({}, { message: 'Formato de e-mail inválido.' })
    @IsOptional()
    email?: string;

    // Senha é opcional na atualização
    @IsString()
    @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres.' })
    @IsOptional()
    password?: string;

    @IsString()
    @IsOptional()
    avatar?: string;

    @IsString()
    @IsOptional()
    cpf?: string;

    @IsString()
    @IsOptional()
    cep?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsInt({ message: 'O ID do nível de acesso deve ser um número.' })
    @IsOptional()
    nivelAcessoId?: number;

    @IsEnum(EnumUserType, { message: 'Tipo de usuário inválido.' })
    @IsOptional()
    type?: EnumUserType;

    @IsBoolean()
    @IsOptional()
    active?: boolean;
}