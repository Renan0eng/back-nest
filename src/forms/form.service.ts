import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { SaveFormDto } from './dto/save-form.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';

@Injectable()
export class FormService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        const formsWithCount = await this.prisma.form.findMany({
            select: {
                idForm: true,
                title: true,
                description: true,
                updatedAt: true,
                _count: {
                    select: {
                        responses: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        const forms = formsWithCount.map(form => ({
            idForm: form.idForm,
            title: form.title,
            description: form.description,
            updatedAt: form.updatedAt,
            responses: form._count.responses,
        }));

        return forms;
    }

    async findOne(idForm: string) {
        const form = await this.prisma.form.findUnique({
            where: { idForm },
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
            throw new NotFoundException(`Formulário com ID ${idForm} não encontrado.`);
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
                                order: oIndex,
                                value: opt.value,
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
                where: { idForm: formId },
                data: { title, description },
            });



            // 2. busca as perguntas antigas e percorre as questions deleta as antigas e atualiza as novas

            const oldQuestions = await tx.question.findMany({
                where: { formId: formId },
            });

            for (const question of questions) {
                const oldQuestion = oldQuestions.find(q => q.idQuestion === question.idQuestion);
                if (oldQuestion) {
                    // Atualiza a pergunta existente
                    await tx.question.update({
                        where: { idQuestion: oldQuestion.idQuestion },
                        data: {
                            text: question.text,
                            type: question.type,
                            required: question.required,
                        },
                    });

                    const oldOptions = await tx.option.findMany({
                        where: { questionId: oldQuestion.idQuestion },
                    });
                    for (const option of question.options) {
                        const oldOption = oldOptions.find(o => o.idOption === option.idOption);
                        if (oldOption) {
                            await tx.option.update({
                                where: { idOption: oldOption.idOption },
                                data: {
                                    text: option.text,
                                    value: option.value,
                                },
                            });
                        } else {
                            await tx.option.create({
                                data: {
                                    text: option.text,
                                    order: question.options.indexOf(option),
                                    value: option.value,
                                    questionId: oldQuestion.idQuestion,
                                },
                            });
                        }
                    }

                } else {
                    // Cria uma nova pergunta
                    const newQuestion = await tx.question.create({
                        data: {
                            text: question.text,
                            type: question.type,
                            required: question.required,
                            order: questions.indexOf(question),
                            formId: formId,
                        },
                    });

                    // Cria as opções para a nova pergunta
                    await tx.option.createMany({
                        data: question.options.map((opt, oIndex) => ({
                            text: opt.text,
                            order: oIndex,
                            value: opt.value,
                            questionId: newQuestion.idQuestion,
                        })),
                    });
                }
            }


            // XX2. Deleta TODAS as perguntas e opções antigas (onDelete: Cascade cuida das opções)
            // await tx.question.deleteMany({
            //     where: { formId: formId },
            // });

            // 3. Recria as perguntas e opções com base no novo estado
            // (Tivemos que fazer isso em dois passos pois o deleteMany não pode
            // ser executado na mesma operação de "update" com "create" aninhado)
            // const updatedForm = await tx.form.update({
            //     where: { idForm: formId },
            //     data: {
            //         questions: {
            //             create: questions.map((q, qIndex) => ({
            //                 text: q.text,
            //                 type: q.type,
            //                 required: q.required,
            //                 order: qIndex,
            //                 options: {
            //                     create: q.options.map((opt, oIndex) => ({
            //                         text: opt.text,
            //                         order: oIndex,
            //                         value: opt.value,
            //                     })),
            //                 },
            //             })),
            //         },
            //     },
            //     include: {
            //         questions: { include: { options: true } }, // Retorna o formulário atualizado
            //     },
            // });

            const updatedForm = await tx.form.findUnique({
                where: { idForm: formId },
                include: {
                    questions: {
                        orderBy: { order: 'asc' },
                        include: {
                            options: {
                                orderBy: { order: 'asc' },
                            },
                        },
                    },
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
                    form: { connect: { idForm: formId } },
                    // Se o userId foi fornecido, conecta-o
                    ...(userId && { user: { connect: { idUser: userId } } }),
                },
            });

            // 4. Prepara os dados para todas as respostas individuais
            const answersToCreate = answers.map((answer) => ({
                responseId: newResponse.idResponse, // Vincula à resposta-pai
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
            where: { idForm: formId },
            select: {
                idForm: true,
                title: true,
                responses: {
                    select: {
                        idResponse: true,
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
            where: { idResponse: responseId },
            include: {
                form: {
                    select: {
                        idForm: true,
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
                            include: {
                                options: true,
                            },
                        },
                    },
                },
            },
        });

        if (!response) {
            throw new NotFoundException(`Resposta com ID ${responseId} não encontrada.`);
        }

        // --- 2. O CÁLCULO DO SCORE ---
        let totalScore = 0;
        const answersWithScore:{
            idResponse: string;
            value: string | null;
            values: string[] | null;
            score: number;
            question: {
                idQuestion: string;
                text: string;
                type: string;
                options: {
                    idOption: string;
                    text: string;
                    value: number | null;
                }[];
            };
        }[] = []; // Novo array para as respostas processadas

        // Itera sobre cada resposta individual (Answer)
        for (const answer of response.answers) {
            const question = answer.question;
            let currentAnswerScore = 0; // Pontuação para esta resposta

            // Se a pergunta for de múltipla escolha ou checkbox...
            if (question.type === 'CHECKBOXES') {
                // O usuário marcou várias opções (ex: ["Opção A", "Opção C"])
                // Buscamos todas as opções que dão "match"
                const selectedOptions = question.options.filter(opt =>
                    answer.values.includes(opt.text)
                );

                // Somamos o valor de CADA opção marcada
                for (const opt of selectedOptions) {
                    currentAnswerScore += (opt.value || 0); // (opt.value || 0) trata valor nulo
                }

            } else if (question.type === 'MULTIPLE_CHOICE') {
                // O usuário marcou uma opção (ex: "Opção B")
                // Buscamos a UMA opção que dá "match"
                const selectedOption = question.options.find(opt =>
                    opt.text === answer.value
                );

                if (selectedOption) {
                    currentAnswerScore = (selectedOption.value || 0);
                }

            }
            // Para 'SHORT_TEXT' ou 'PARAGRAPH', a pontuação é 0.

            // Adiciona a pontuação desta resposta ao total
            totalScore += currentAnswerScore;

            // Prepara o objeto de detalhe para o front-end
            // (Este formato corresponde ao seu 'ResponseAnswerDetail' da conversa anterior)
            answersWithScore.push({
                idResponse: answer.idAnswer, // ID do 'Answer'
                value: answer.value,
                values: answer.values,
                score: currentAnswerScore, // A pontuação calculada
                question: {
                    idQuestion: question.idQuestion,
                    text: question.text,
                    type: question.type,
                    options: question.options
                }
            });
        }

        // 3. O Resultado Final
        // Retorna o objeto 'response' original, mas com o array 'answers'
        // substituído pelo nosso array processado ('answersWithScore'),
        // e adiciona o 'totalScore'.
        return {
            ...response, // Mantém idResponse, submittedAt, form, user
            answers: answersWithScore, // O array de respostas com o score individual
            totalScore: totalScore     // A SOMA TOTAL dos scores
        };
    }
}