import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { SaveFormDto } from './dto/save-form.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';

@Injectable()
export class FormService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.form.findMany({
            // Selecionamos apenas os dados da lista
            select: {
                id: true,
                title: true,
                description: true,
                updatedAt: true, // Útil para ordenar
            },
            orderBy: {
                updatedAt: 'desc', // Mostra os mais recentes primeiro
            },
        });
    }

    // Busca um formulário específico com suas perguntas e opções ordenadas
    async findOne(id: string) {
        const form = await this.prisma.form.findUnique({
            where: { id },
            include: {
                questions: {
                    orderBy: { order: 'asc' }, // Ordena as perguntas
                    include: {
                        options: {
                            orderBy: { order: 'asc' }, // Ordena as opções
                        },
                    },
                },
            },
        });

        if (!form) {
            throw new NotFoundException(`Formulário com ID ${id} não encontrado.`);
        }
        return form;
    }

    // Cria um novo formulário (ex: a partir de um botão "Novo Formulário")
    async create(dto: SaveFormDto) {
        const { title, description, questions } = dto;

        return this.prisma.form.create({
            data: {
                title,
                description,
                questions: {
                    create: questions.map((q, qIndex) => ({
                        text: q.text,
                        type: q.type,
                        required: q.required,
                        order: qIndex, // Salva a ordem
                        options: {
                            create: q.options.map((opt, oIndex) => ({
                                text: opt.text,
                                order: oIndex, // Salva a ordem
                            })),
                        },
                    })),
                },
            },
        });
    }

    // Atualiza um formulário existente (a lógica principal de "Salvar")
    async update(formId: string, dto: SaveFormDto) {
        const { title, description, questions } = dto;

        // Usamos uma transação para garantir que tudo seja feito de uma vez
        return this.prisma.$transaction(async (tx) => {
            // 1. Atualiza o título e a descrição do formulário
            await tx.form.update({
                where: { id: formId },
                data: { title, description },
            });

            // 2. Deleta TODAS as perguntas e opções antigas (onDelete: Cascade cuida das opções)
            await tx.question.deleteMany({
                where: { formId: formId },
            });

            // 3. Recria as perguntas e opções com base no novo estado
            // (Tivemos que fazer isso em dois passos pois o deleteMany não pode
            // ser executado na mesma operação de "update" com "create" aninhado)
            const updatedForm = await tx.form.update({
                where: { id: formId },
                data: {
                    questions: {
                        create: questions.map((q, qIndex) => ({
                            text: q.text,
                            type: q.type,
                            required: q.required,
                            order: qIndex,
                            options: {
                                create: q.options.map((opt, oIndex) => ({
                                    text: opt.text,
                                    order: oIndex,
                                })),
                            },
                        })),
                    },
                },
                include: {
                    questions: { include: { options: true } }, // Retorna o formulário atualizado
                },
            });

            return updatedForm;
        });
    }

    async submitResponse(
        formId: string,
        submitResponseDto: SubmitResponseDto,
        userId?: string, // 2. Recebe o userId (opcional)
    ) {
        const { answers } = submitResponseDto;

        // Usamos uma transação para garantir que ou tudo é salvo, ou nada é.
        return this.prisma.$transaction(async (tx) => {
            // 3. Cria o "recibo" da Resposta, vinculando ao formulário e ao usuário
            const newResponse = await tx.response.create({
                data: {
                    form: { connect: { id: formId } },
                    // Se o userId foi fornecido, conecta-o
                    ...(userId && { user: { connect: { idUser: userId } } }),
                },
            });

            // 4. Prepara os dados para todas as respostas individuais
            const answersToCreate = answers.map((answer) => ({
                responseId: newResponse.id, // Vincula à resposta-pai
                questionId: answer.questionId,
                value: answer.value,   // Será 'null' se for CHECKBOX
                values: answer.values, // Será 'null' se for outro tipo
            }));

            // 5. Cria todas as respostas individuais de uma só vez
            await tx.answer.createMany({
                data: answersToCreate,
            });

            return newResponse;
        });
    }

    async findResponses(formId: string) {
        // Busca o formulário e suas respostas, incluindo o usuário que enviou
        return this.prisma.form.findUnique({
            where: { id: formId },
            select: {
                id: true,
                title: true,
                responses: {
                    select: {
                        id: true, 
                        submittedAt: true,
                        user: {
                            select: {
                                idUser: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: {
                        submittedAt: 'desc',
                    },
                },
            },
        });
    }

    // NOVO MÉTODO: Ver detalhes de uma submissão
    async findResponseDetail(responseId: string) {
        const response = await this.prisma.response.findUnique({
            where: { id: responseId },
            include: {
                form: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                user: {
                    select: {
                        idUser: true,
                        name: true,
                        email: true,
                    },
                },
                answers: {
                    include: {
                        question: {
                            select: {
                                id: true,
                                text: true,
                                type: true,
                            },
                        },
                    },
                },
            },
        });

        if (!response) {
            throw new NotFoundException(`Resposta com ID ${responseId} não encontrada.`);
        }
        return response;
    }
}