const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect('mongodb://localhost:27017/webhookos-database').then(async () => {
  const r = await mongoose.connection.db.collection('users').updateOne(
    { email: 'anujy5706@gmail.com' },
    { $set: { role: 'super_admin' } }
  );
  console.log('Updated:', r.modifiedCount);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
