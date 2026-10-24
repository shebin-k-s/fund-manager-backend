import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per payroll month.
@Entity('pf_records')
export class PfRecord {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // 'YYYY-MM'
    @Column({ type: 'varchar', length: 7, unique: true })
    month: string;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    employeePf: string;

    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    employerPf: string | null;

    @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
    gross: string | null;

    @Column({ type: 'varchar', nullable: true, unique: true })
    driveFileId: string | null;

    @Column({ type: 'varchar', nullable: true })
    fileName: string | null;

    // A hand-corrected or hand-added row: a later sync never overwrites it.
    @Column({ default: false })
    edited: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
