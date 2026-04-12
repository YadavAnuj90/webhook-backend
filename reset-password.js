const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
  await mongoose.connect('mongodb://localhost:27017/webhookos-database');
  const hash = await bcrypt.hash('@YadavAnjali1011', 12);
  const r = await mongoose.connection.db.collection('users').updateOne(
    { email: 'anujy5706@gmail.com' },
    { $set: { passwordHash: hash, role: 'super_admin', emailVerified: true } }
  );
  console.log('Password reset + super_admin + emailVerified:', r.modifiedCount);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
