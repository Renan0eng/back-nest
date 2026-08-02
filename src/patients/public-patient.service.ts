import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/database/prisma.service';
import { RegisterPatientDto } from './dto/register-patient.dto';

const patientSelect = Prisma.validator<Prisma.UserSelect>()({
  idUser: true,
  name: true,
  avatar: true,
  email: true,
  cpf: true,
  cep: true,
  phone: true,
  created: true,
  updated: true,
  active: true,
  nivelAcessoId: true,
  type: true,
  birthDate: true,
  sexo: true,
  unidadeSaude: true,
  medicamentos: true,
  exames: true,
  examesDetalhes: true,
  alergias: true,
});

@Injectable()
export class PublicPatientService {
  constructor(private prisma: PrismaService, private authService: AuthService) {}

  async createPublic(dto: RegisterPatientDto) {
    if (!dto.cpf) {
      throw new BadRequestException('CPF é obrigatório para auto cadastro público');
    }

    const hashedPassword = await this.authService.cryptPassword(dto.password);
    const cpfStored = `${dto.cpf}_AUTO_CADASTRO_${Date.now()}`;

    // Pacientes cadastrados pelo app entram no grupo padrão do sistema
    const grupoPadrao = await this.prisma.grupo.findFirst({
      where: { isDefault: true },
      select: { idGrupo: true },
    });

    const data: any = {
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      cpf: cpfStored,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      sexo: dto.sexo,
      unidadeSaude: dto.unidadeSaude,
      medicamentos: dto.medicamentos,
      exames: typeof dto.exames !== 'undefined' ? dto.exames : undefined,
      examesDetalhes: dto.examesDetalhes,
      alergias: dto.alergias,
      type: 'PACIENTE',
      active: false,
      autoCadastro: true,
      ...(grupoPadrao && { grupoPacienteId: grupoPadrao.idGrupo }),
    };

    try {
      const created = await this.prisma.user.create({
        data,
        select: patientSelect,
      });
      if (grupoPadrao) {
        await this.prisma.grupo_Membro.create({ data: { grupoId: grupoPadrao.idGrupo, userId: created.idUser } });
      }
      return created;
    } catch (e: any) {
      // Unique constraint or other errors
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          const target = (e.meta && (e.meta.target as string[]).join(', ')) || 'campo único';
          throw new BadRequestException(`Já existe um paciente com este(s) ${target}`);
        }
      }
      throw new BadRequestException('Não foi possível criar paciente público');
    }
  }
}
