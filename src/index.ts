import express, { RequestHandler} from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

const identifyHandler = async (req, res) => {

//app.post('/identify', async (req: express.Request, res: express.Response) => {
app.post('/identify', identifyHandler);
  const { email, phoneNumber }: {email?: string; phoneNumber?: string} = req.body;
  if (!email && !phoneNumber) return res.status(400).json({ error: 'email or phoneNumber required' });

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { email: email || undefined },
        { phoneNumber: phoneNumber || undefined },
      ],
    },
  });

  let allContacts: any[] = [];
  const uniqueIds = new Set<number>();
  for (const contact of contacts) {
    if (contact.linkedId) {
      const root = await prisma.contact.findUnique({ where: { id: contact.linkedId } });
      if (root) uniqueIds.add(root.id);
    } else {
      uniqueIds.add(contact.id);
    }
  }

  let primary: any;
  if (uniqueIds.size === 0) {
    primary = await prisma.contact.create({
      data: { email, phoneNumber, linkPrecedence: 'primary' },
    });
    return res.json({
      contact: {
        primaryContatctId: primary.id,
        emails: [primary.email].filter(Boolean),
        phoneNumbers: [primary.phoneNumber].filter(Boolean),
        secondaryContactIds: [],
      },
    });
  }

  const allLinked = await prisma.contact.findMany({
    where: {
      OR: [
        { id: { in: Array.from(uniqueIds) } },
        { linkedId: { in: Array.from(uniqueIds) } },
      ],
    },
  });

  allContacts = [...allLinked];
  primary = allContacts.reduce((prev, curr) => (prev.createdAt < curr.createdAt ? prev : curr));

  if (!allContacts.some(c => c.email === email && c.phoneNumber === phoneNumber)) {
    await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkedId: primary.id,
        linkPrecedence: 'secondary',
      },
    });
    allContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: primary.id },
          { linkedId: primary.id },
        ],
      },
    });
  }

  const emails = Array.from(new Set([primary.email, ...allContacts.map(c => c.email)].filter(Boolean)));
  const phoneNumbers = Array.from(new Set([primary.phoneNumber, ...allContacts.map(c => c.phoneNumber)].filter(Boolean)));
  const secondaryContactIds = allContacts.filter(c => c.linkPrecedence === 'secondary').map(c => c.id);

  res.json({
    contact: {
      primaryContatctId: primary.id,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  });
};

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
