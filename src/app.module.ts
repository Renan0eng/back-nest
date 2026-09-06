import { Module } from '@nestjs/common';
import { AcessoModule } from './acesso/acesso.module';
import { AvatarModule } from './avatars/avatar.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AttendancesModule } from './attendances/attendances.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CampanhasModule } from './campanhas/campanhas.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DatabaseModule } from './database/database.module';
import { EscalaModule } from './escala/escala.module';
import { EstoqueModule } from './estoque/estoque.module';
import { ExamRequestsModule } from './exam-requests/exam-requests.module';
import { FilaModule } from './fila/fila.module';
import { FormModule } from './forms/form.module';
import { GruposModule } from './grupos/grupos.module';
import { LogsModule } from './logs/logs.module';
import { MedicosModule } from './medicos/medicos.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';
import { PushModule } from './push/push.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [AuthModule, DatabaseModule, AvatarModule, FormModule, AcessoModule, UserModule, AppointmentsModule, AttendancesModule, PatientsModule, LogsModule, NotificationsModule, PushModule, AdminDashboardModule, ChatModule, CampanhasModule, GruposModule, MedicosModule, EscalaModule, FilaModule, EstoqueModule, ExamRequestsModule],
  providers: [AllExceptionsFilter],
})
export class AppModule {}
