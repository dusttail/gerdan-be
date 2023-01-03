import { BelongsTo, Column, DataType, ForeignKey, HasMany, Scopes, Table } from 'sequelize-typescript';
import { BaseModel } from '../common/base.model';
import { commonScopes } from '../common/common.scopes';
import { Pixel } from './pixel.model';
import { User } from './user.model';

@Scopes(() => Object.assign({
    withAuthor: () => ({ include: { model: User, required: true } }),
    byAuthorId: (userId) => ({ where: { userId } })
}, commonScopes))
@Table
export class Gerdan extends BaseModel {
    @ForeignKey(() => User)
    @Column({
        type: DataType.INTEGER,
        allowNull: false,
    })
    userId: ID;

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    name: string;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
    })
    width: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
    })
    height: number;

    @Column({
        type: DataType.CHAR(7),
        allowNull: false,
    })
    backgroundColor: string;

    @HasMany(() => Pixel)
    pixels: Pixel[];

    @BelongsTo(() => User)
    author: User;

}
