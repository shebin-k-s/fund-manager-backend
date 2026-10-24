import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// The single row that holds the read-only Google Drive connection used to read payslips. Like
// backup_settings it is left out of backups and restores (see EXCLUDED_TABLES): a backup must
// never carry the access key.
@Entity('payslip_settings')
export class PayslipSettings {
    @PrimaryColumn()
    id: string; // always 'default'

    // AES-256-GCM encrypted Google refresh token — never stored in plain text.
    @Column({ type: 'text', nullable: true })
    refreshTokenEnc: string | null;

    @Column({ type: 'varchar', nullable: true })
    accountEmail: string | null;

    // The Drive folder the payslip PDFs are read from.
    @Column({ type: 'varchar', nullable: true })
    folderId: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    lastSyncAt: Date | null;

    @Column({ type: 'varchar', nullable: true })
    lastStatus: 'ok' | 'error' | null;

    @Column({ type: 'text', nullable: true })
    lastMessage: string | null;

    @UpdateDateColumn()
    updatedAt: Date;
}
