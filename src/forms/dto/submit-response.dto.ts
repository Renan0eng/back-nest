// src/forms/dto/submit-response.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

// Este DTO aninhado valida cada resposta individual
class AnswerDto {
    @IsString()
    questionId: string;

    @IsString()
    @IsOptional() // Opcional porque pode ser 'values'
    value?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional() // Opcional porque pode ser 'value'
    values?: string[];
}

export class SubmitResponseDto {
    // Esperamos um array de objetos de resposta
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AnswerDto)
    answers: AnswerDto[];
}