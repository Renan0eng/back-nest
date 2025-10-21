import { IsEmail, IsString, MinLength } from 'class-validator';
import { Prisma } from 'generated/prisma';

export class RegisterUserDto implements Pick<Prisma.UserCreateInput, 'email' | 'password' | 'name'> {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsString()
    name: string;
}
