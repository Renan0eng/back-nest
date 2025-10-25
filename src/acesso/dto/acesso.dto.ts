import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator'

/**
 * DTO para criar um Nivel_Acesso.
 * Usado em: POST /admin/acesso/niveis
 */
export class CreateNivelAcessoDto {
    @IsString({ message: 'O nome deve ser um texto.' })
    @IsNotEmpty({ message: 'O nome é obrigatório.' })
    @MinLength(3, { message: 'O nome deve ter pelo menos 3 caracteres.' })
    nome: string

    @IsString({ message: 'A descrição deve ser um texto.' })
    @IsOptional()
    descricao?: string
}

/**
 * DTO para atualizar um Nivel_Acesso.
 * Usado em: PUT /admin/acesso/niveis/:id
 */
export class UpdateNivelAcessoDto extends CreateNivelAcessoDto { }

/**
 * DTO para atualizar os menus vinculados a um Nivel_Acesso.
 * Usado em: PUT /admin/acesso/niveis/:id/menus
 */
export class UpdateNivelMenusDto {
    @IsArray({ message: 'menuIds deve ser um array.' })
    @IsInt({ each: true, message: 'Cada ID do menu deve ser um número inteiro.' })
    menuIds: number[]
}

/**
 * DTO para criar um Menu_Acesso.
 * Usado em: POST /admin/acesso/menus
 */
export class CreateMenuAcessoDto {
    @IsString()
    @IsNotEmpty({ message: 'O nome do menu é obrigatório.' })
    nome: string

    @IsString()
    @IsNotEmpty({ message: 'O slug é obrigatório.' })
    @MinLength(3, { message: 'O slug deve ter pelo menos 3 caracteres.' })
    slug: string

    @IsBoolean()
    @IsOptional()
    visualizar?: boolean

    @IsBoolean()
    @IsOptional()
    criar?: boolean

    @IsBoolean()
    @IsOptional()
    editar?: boolean

    @IsBoolean()
    @IsOptional()
    excluir?: boolean

    @IsBoolean()
    @IsOptional()
    relatorio?: boolean
}

export class UpdateUserNivelDto {
    @IsInt({ message: 'O ID do nível de acesso deve ser um número.' })
    @IsNotEmpty({ message: 'O ID do nível de acesso é obrigatório.' })
    nivelAcessoId: number
}

export class UpdateMenuAcessoDto extends CreateMenuAcessoDto { }