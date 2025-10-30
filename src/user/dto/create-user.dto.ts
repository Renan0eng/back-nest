import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { EnumUserType } from 'generated/prisma';

export class CreateUserDto {
    @IsString()
    @IsNotEmpty({ message: 'O nome é obrigatório.' })
    name: string;

    @IsEmail({}, { message: 'Formato de e-mail inválido.' })
    @IsNotEmpty({ message: 'O e-mail é obrigatório.' })
    email: string;

    @IsString()
    @IsNotEmpty({ message: 'A senha é obrigatória.' })
    @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres.' })
    password: string;

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
    @IsNotEmpty({ message: 'O nível de acesso é obrigatório.' })
    nivelAcessoId: number;

    @IsEnum(EnumUserType, { message: 'Tipo de usuário inválido.' })
    @IsOptional() // O default é PACIENTE no schema
    type?: EnumUserType;

    @IsBoolean()
    @IsOptional() // O default é false no schema
    active?: boolean;
}