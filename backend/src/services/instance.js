// Identidade deste processo do Node. O Hostinger pode rodar mais de um ao mesmo tempo,
// e o id aparece no log da subida pra dar pra saber qual processo escreveu cada linha.
export const INSTANCE_ID = `${process.pid}-${Date.now()}`;
