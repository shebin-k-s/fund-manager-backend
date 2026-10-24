// Date and time in India Standard Time, as "yyyy-MM-dd" and "HH:mm" — used to name backup files.
export function getISTParts(date: Date = new Date()): { dateString: string; timeString: string } {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    const hour = get('hour') === '24' ? '00' : get('hour');
    return { dateString: `${get('year')}-${get('month')}-${get('day')}`, timeString: `${hour}:${get('minute')}` };
}
