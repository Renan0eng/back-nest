import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { QuestionType } from '@prisma/client';

class OptionDto {
  @IsOptional()
  @IsString()
  idOption?: string;

  @IsString()
  text: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  value: number;
}

class QuestionDto {
  @IsOptional()
  @IsString()
  idQuestion?: string;

  @IsString()
  text: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options?: OptionDto[];
}

class ScoreRuleDto {
  @IsInt()
  @Min(0)
  minScore: number;

  @IsInt()
  @Min(0)
  maxScore: number;

  @IsString()
  classification: string;

  @IsString()
  conduct: string;

  @IsString()
  @IsOptional()
  targetUserId?: string;

  @IsInt()
  @IsOptional()
  order?: number;
}

export class SaveFormDto {
  @IsString()
  @MinLength(4, { message: 'O título deve ter no mínimo 4 caracteres' })
  title: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsOptional()
  @IsString()
  scoreFormula?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreRuleDto)
  @IsOptional()
  scoreRules?: ScoreRuleDto[];
}
