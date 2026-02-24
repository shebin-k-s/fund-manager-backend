function getISTDate() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 5.5 * 60 * 60000);
}

function generatePassword() {
    const ist = getISTDate();

    const hh = ist.getHours();
    const mm = ist.getMinutes();



    return `${process.env.PREFIX}${hh}${mm}${process.env.SUFFIX}`;
}

export const isKeyValid = (key: string) => {
    return key === generatePassword();
}