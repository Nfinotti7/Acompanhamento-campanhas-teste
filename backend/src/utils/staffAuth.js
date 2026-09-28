import bcrypt from 'bcryptjs';

export async function hashPin(pin) {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN deve ter entre 4 e 8 dígitos numéricos.');
  }
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(pin, salt);
}

export function verifyPin(pin, hash) {
  return bcrypt.compareSync(pin, hash);
}
