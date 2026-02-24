function getISTDate() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 5.5 * 60 * 60000);
}

function pad(n: number) {
    return n.toString().padStart(2, '0');
}

function generatePassword() {
    const ist = getISTDate();

    const hh = pad(ist.getHours());
    const mm = pad(ist.getMinutes());

    return `${process.env.PREFIX}${hh}${mm}${process.env.SUFFIX}`;
}

export const isKeyValid = (key: string) => {
    const generatedPassword = generatePassword();
    console.log('Generated password:', generatedPassword);
    return key == generatedPassword;
}