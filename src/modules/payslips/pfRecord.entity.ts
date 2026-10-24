import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

// One row per company per payroll month.
@Entity('pf_records')
@Unique(['company', 'month'])
export class PfRecord {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // The employer: the company folder the payslip was found in, or typed by hand. '' when unknown.
    @Column({ type: 'varchar', length: 100, default: '' })
    company: string;

    // 'YYYY-MM'
    @Column({ type: 'varchar', length: 7 })
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
