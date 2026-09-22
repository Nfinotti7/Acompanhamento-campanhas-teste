import db from '../config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  try {
    const { rows: clients } = await db.query('SELECT * FROM clients');
    console.log('--- CLIENTS ---');
    console.log(clients);

    const { rows: creds } = await db.query('SELECT * FROM credentials');
    console.log('--- CREDENTIALS ---');
    console.log(creds);
  } catch (err) {
    console.error(err);
  } process.exit(0);
}

main();
