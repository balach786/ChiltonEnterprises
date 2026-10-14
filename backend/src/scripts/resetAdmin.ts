import bcrypt from 'bcryptjs';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { User } from '../models';

async function main() {
  await connectMongo();
  const users = await User.find({});
  console.log('Total users found:', users.length);
  for (const u of users) {
    console.log(`- User: ${u.email} | Name: ${u.name} | Role: ${u.role}`);
  }

  // Ensure admin@showroom.local exists and has password Admin@12345
  const admin = await User.findOne({ email: 'admin@showroom.local' });
  const hash = await bcrypt.hash('Admin@12345', 10);
  if (admin) {
    admin.passwordHash = hash;
    admin.mustChangePassword = false;
    await admin.save();
    console.log('Updated admin@showroom.local password to Admin@12345');
  } else {
    await User.create({
      name: 'System Administrator',
      email: 'admin@showroom.local',
      passwordHash: hash,
      role: 'owner',
      mustChangePassword: false,
    });
    console.log('Created admin@showroom.local with password Admin@12345');
  }

  await disconnectMongo();
}

main().catch(console.error);
