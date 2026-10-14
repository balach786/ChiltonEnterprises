const mongoose = require('mongoose');
require('dotenv').config();

async function clean() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  // Collections to clean (test / dummy customer data)
  const collectionsToClean = [
    'customers',
    'schemeenrollments',
    'payments',
    'receipts',
    'customeradvances',
    'drawevents',
    'expensetransactions',
    'incometransactions',
    'partnertransactions',
    'cashmovements',
    'reconciliations',
    'transfers',
    'customerclosures',
    'installments'
  ];

  for (const name of collectionsToClean) {
    try {
      const res = await mongoose.connection.db.collection(name).deleteMany({});
      console.log(`Cleaned collection ${name}: deleted ${res.deletedCount} records.`);
    } catch (e) {
      console.warn(`Collection ${name}: ${e.message}`);
    }
  }

  // Reset tokens to unassigned (available)
  try {
    const res = await mongoose.connection.db.collection('tokens').updateMany({}, {
      $set: {
        status: 'AVAILABLE',
        customer: null,
        assignedAt: null
      }
    });
    console.log(`Reset tokens: updated ${res.modifiedCount} tokens to AVAILABLE.`);
  } catch (e) {
    console.warn(`Tokens reset: ${e.message}`);
  }

  console.log('Database cleaned successfully.');
  process.exit(0);
}

clean().catch(err => {
  console.error('Clean failed:', err);
  process.exit(1);
});
