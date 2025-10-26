import { IsBoolean, IsNotEmpty } from "class-validator";

export class UpdateUserStatusDto {
    @IsBoolean({ message: 'O status deve ser um booleano.' })
    @IsNotEmpty({ message: 'O status "active" é obrigatório.' })
    active: boolean;
}