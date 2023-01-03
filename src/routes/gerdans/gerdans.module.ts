import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Gerdan } from 'src/database/models/gerdan.model';
import { Pixel } from 'src/database/models/pixel.model';
import { User } from 'src/database/models/user.model';
import { FileStorageService } from 'src/services/file_storage/file_storage.service';
import { UsersService } from '../users/users.service';
import { GerdansController } from './gerdans.controller';
import { GerdansService } from './gerdans.service';

@Module({
    imports: [SequelizeModule.forFeature([Gerdan, Pixel, User])],
    controllers: [GerdansController],
    providers: [GerdansService, UsersService, FileStorageService]
})
export class GerdansModule { }
