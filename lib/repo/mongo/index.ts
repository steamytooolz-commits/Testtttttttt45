import 'server-only';
import { getMongoDb } from './client';

export interface ProductDocument {
  _id: string;
  name: string;
  description: string;
  categoryRef: string;
  attributes: {
    paperWeight?: string;
    packCount?: number;
    colour?: string;
  };
  variants: string[];
  mediaRefs: string[];
  imageUrl?: string;
  active: boolean;
  updatedAt: string;
}

export interface CategoryDocument {
  _id: string;
  slug: string;
  name: string;
  description: string;
}

const memoryCategories: CategoryDocument[] = [
  { _id: 'cat-paper', slug: 'paper', name: 'Paper & Envelopes', description: 'Premium bond, reams, and mailing supplies' },
  { _id: 'cat-writing', slug: 'writing', name: 'Writing Instruments', description: 'Ballpoint pens, fineliners, highlighters' },
  { _id: 'cat-filing', slug: 'filing', name: 'Filing & Folders', description: 'Lever arch files, ring binders, file dividers' },
];

const memoryProducts: ProductDocument[] = [

  {
    _id: 'SKU-PPR-A4-80G',
    name: 'Typek A4 White Copy Paper 80gsm',
    description: 'High performance multipurpose office copy paper, 500 sheets per ream',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '80gsm', packCount: 500, colour: 'White' },
    variants: ['SKU-PPR-A4-75G', 'SKU-PPR-A3-80G'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PPR-A4-75G',
    name: 'Rotatrim A4 White Copy Paper 75gsm',
    description: 'Reliable high-volume laser and inkjet printing paper, 500 sheets per ream',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '75gsm', packCount: 500, colour: 'White' },
    variants: ['SKU-PPR-A4-80G'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PPR-A3-80G',
    name: 'Typek A3 White Copy Paper 80gsm',
    description: 'Wide-format high opacity office paper, 500 sheets per ream',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '80gsm', packCount: 500, colour: 'White' },
    variants: ['SKU-PPR-A4-80G'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PPR-A4-COL-YLW',
    name: 'Mondi Color Copy A4 Pastel Yellow 80gsm',
    description: 'Tinted smooth office paper for notices and flyers, 500 sheets per ream',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '80gsm', packCount: 500, colour: 'Yellow' },
    variants: ['SKU-PPR-A4-COL-BLU', 'SKU-PPR-A4-COL-GRN'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PPR-A4-COL-BLU',
    name: 'Mondi Color Copy A4 Pastel Blue 80gsm',
    description: 'Tinted smooth office paper for color coding, 500 sheets per ream',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '80gsm', packCount: 500, colour: 'Blue' },
    variants: ['SKU-PPR-A4-COL-YLW', 'SKU-PPR-A4-COL-GRN'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PPR-A4-COL-GRN',
    name: 'Mondi Color Copy A4 Pastel Green 80gsm',
    description: 'Tinted smooth office paper for filing accents, 500 sheets per ream',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '80gsm', packCount: 500, colour: 'Green' },
    variants: ['SKU-PPR-A4-COL-YLW', 'SKU-PPR-A4-COL-BLU'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PPR-A4-160G',
    name: 'Mondi Color Copy A4 White Board 160gsm',
    description: 'Heavyweight cardstock for certificates, covers, and presentation sheets, 250 sheets',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '160gsm', packCount: 250, colour: 'White' },
    variants: [],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-ENV-DL-WS',
    name: 'Croxley DL White Self-Seal Envelopes 80gsm',
    description: 'Standard business commercial mailing envelopes 110x220mm, box of 500',
    categoryRef: 'cat-paper',
    attributes: { paperWeight: '80gsm', packCount: 500, colour: 'White' },
    variants: ['SKU-ENV-C4-WS'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-ENV-C4-WS',
    name: 'Croxley C4 Manilla Self-Seal Pocket Envelopes',
    description: 'Heavy duty A4 document postal pocket envelopes 229x324mm, box of 250',
    categoryRef: 'cat-paper',
    attributes: { packCount: 250, colour: 'Manilla' },
    variants: ['SKU-ENV-DL-WS'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },

  {
    _id: 'SKU-PEN-BLU-05',
    name: 'Bic Cristal Medium Ballpoint Pen Blue',
    description: 'Classic hexagonal barrel ballpoint pen with 1.0mm tip, box of 50',
    categoryRef: 'cat-writing',
    attributes: { packCount: 50, colour: 'Blue' },
    variants: ['SKU-PEN-RED-05', 'SKU-PEN-BLK-05', 'SKU-PEN-GRN-05'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PEN-RED-05',
    name: 'Bic Cristal Medium Ballpoint Pen Red',
    description: 'Vibrant red ink ballpoint pen with 1.0mm tungsten carbide ball, box of 50',
    categoryRef: 'cat-writing',
    attributes: { packCount: 50, colour: 'Red' },
    variants: ['SKU-PEN-BLU-05', 'SKU-PEN-BLK-05', 'SKU-PEN-GRN-05'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PEN-BLK-05',
    name: 'Bic Cristal Medium Ballpoint Pen Black',
    description: 'Deep black archival ink ballpoint pen with clear barrel, box of 50',
    categoryRef: 'cat-writing',
    attributes: { packCount: 50, colour: 'Black' },
    variants: ['SKU-PEN-BLU-05', 'SKU-PEN-RED-05', 'SKU-PEN-GRN-05'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PEN-GRN-05',
    name: 'Bic Cristal Medium Ballpoint Pen Green',
    description: 'Auditing green ink ballpoint pen with ventilated cap, box of 50',
    categoryRef: 'cat-writing',
    attributes: { packCount: 50, colour: 'Green' },
    variants: ['SKU-PEN-BLU-05', 'SKU-PEN-RED-05', 'SKU-PEN-BLK-05'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PEN-GEL-BLK',
    name: 'Pilot G2 0.7mm Retractable Gel Pen Black',
    description: 'Smooth dynamic gel ink rollerball pen with rubberized comfort grip, box of 12',
    categoryRef: 'cat-writing',
    attributes: { packCount: 12, colour: 'Black' },
    variants: ['SKU-PEN-GEL-BLU'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-PEN-GEL-BLU',
    name: 'Pilot G2 0.7mm Retractable Gel Pen Blue',
    description: 'Smooth dynamic gel ink rollerball pen with rubberized comfort grip, box of 12',
    categoryRef: 'cat-writing',
    attributes: { packCount: 12, colour: 'Blue' },
    variants: ['SKU-PEN-GEL-BLK'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-MRK-WBD-AST',
    name: 'Artline 5109A Whiteboard Markers Assorted',
    description: 'Dense pigment dry-erase whiteboard markers with bullet nib, wallet of 4',
    categoryRef: 'cat-writing',
    attributes: { packCount: 4, colour: 'Assorted' },
    variants: [],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-HLT-YEL-01',
    name: 'Faber-Castell Textliner 48 Highlighter Yellow',
    description: 'Universal water-based fluorescent highlighter with chisel tip, box of 10',
    categoryRef: 'cat-writing',
    attributes: { packCount: 10, colour: 'Yellow' },
    variants: [],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },

  {
    _id: 'SKU-FIL-LVR-BLK',
    name: 'Bantex Lever Arch File 70mm A4 Black',
    description: 'Durable marbled paperboard lever arch filing mechanism with spine label',
    categoryRef: 'cat-filing',
    attributes: { colour: 'Black' },
    variants: ['SKU-FIL-LVR-BLU', 'SKU-FIL-LVR-RED', 'SKU-FIL-LVR-GRN'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-FIL-LVR-BLU',
    name: 'Bantex Lever Arch File 70mm A4 Blue',
    description: 'Reinforced polypropylene spine lever arch file with rado locking system',
    categoryRef: 'cat-filing',
    attributes: { colour: 'Blue' },
    variants: ['SKU-FIL-LVR-BLK', 'SKU-FIL-LVR-RED', 'SKU-FIL-LVR-GRN'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-FIL-LVR-RED',
    name: 'Bantex Lever Arch File 70mm A4 Red',
    description: 'Reinforced polypropylene spine lever arch file with rado locking system',
    categoryRef: 'cat-filing',
    attributes: { colour: 'Red' },
    variants: ['SKU-FIL-LVR-BLK', 'SKU-FIL-LVR-BLU', 'SKU-FIL-LVR-GRN'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-FIL-LVR-GRN',
    name: 'Bantex Lever Arch File 70mm A4 Green',
    description: 'Reinforced polypropylene spine lever arch file with rado locking system',
    categoryRef: 'cat-filing',
    attributes: { colour: 'Green' },
    variants: ['SKU-FIL-LVR-BLK', 'SKU-FIL-LVR-BLU', 'SKU-FIL-LVR-RED'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-FIL-RNG-BLK',
    name: 'Bantex 2-Ring Binder 25mm A4 Black',
    description: 'Heavy gauge PVC 2 O-ring document presentation binder with clear pocket',
    categoryRef: 'cat-filing',
    attributes: { colour: 'Black' },
    variants: [],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-FIL-DIV-10T',
    name: 'Croxley Mylar Index Dividers 1-10 Tab A4',
    description: 'Reinforced multi-punched plastic index tab dividers for filing systems, 1-10 tabs',
    categoryRef: 'cat-filing',
    attributes: { packCount: 10, colour: 'Assorted' },
    variants: ['SKU-FIL-DIV-31T'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-FIL-DIV-31T',
    name: 'Croxley Mylar Index Dividers 1-31 Tab A4',
    description: 'Reinforced monthly daily index dividers numbered 1-31 for audit files',
    categoryRef: 'cat-filing',
    attributes: { packCount: 31, colour: 'Assorted' },
    variants: ['SKU-FIL-DIV-10T'],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'SKU-FIL-PPC-A4',
    name: 'Bantex Polypropylene Sheet Protectors A4',
    description: 'Crystal clear top opening embossed sheet protectors with reinforced spine, pack of 100',
    categoryRef: 'cat-filing',
    attributes: { packCount: 100, colour: 'Clear' },
    variants: [],
    mediaRefs: [],
    active: true,
    updatedAt: new Date().toISOString(),
  },
];

export async function findProducts(filter: {
  categoryRef?: string;
  paperWeight?: string;
  packCount?: number;
  colour?: string;
  activeOnly?: boolean;
  limit?: number;
} = {}): Promise<ProductDocument[]> {
  const db = await getMongoDb();
  if (!db) {
    const filtered = memoryProducts.filter((p) => {
      if (filter.activeOnly !== false && !p.active) return false;
      if (filter.categoryRef && p.categoryRef !== filter.categoryRef) return false;
      if (filter.paperWeight && p.attributes.paperWeight !== filter.paperWeight) return false;
      if (filter.packCount && p.attributes.packCount !== filter.packCount) return false;
      if (filter.colour && p.attributes.colour !== filter.colour) return false;
      return true;
    });
    return filter.limit ? filtered.slice(0, filter.limit) : filtered;
  }

  const query: Record<string, unknown> = {};
  if (filter.activeOnly !== false) {
    query['active'] = true;
  }
  if (typeof filter.categoryRef === 'string') {
    query['categoryRef'] = filter.categoryRef;
  }
  if (typeof filter.paperWeight === 'string') {
    query['attributes.paperWeight'] = filter.paperWeight;
  }
  if (typeof filter.packCount === 'number') {
    query['attributes.packCount'] = filter.packCount;
  }
  if (typeof filter.colour === 'string') {
    query['attributes.colour'] = filter.colour;
  }

  const cursor = db.collection<ProductDocument>('products').find(query);
  if (filter.limit) {
    cursor.limit(filter.limit);
  }
  const docs = await cursor.toArray();
  return docs;
}

export async function findProductBySku(sku: string): Promise<ProductDocument | null> {
  const db = await getMongoDb();
  if (!db) {
    const found = memoryProducts.find((p) => p._id === sku);
    return found || null;
  }
  return db.collection<ProductDocument>('products').findOne({ _id: sku });
}

export async function findCategories(): Promise<CategoryDocument[]> {
  const db = await getMongoDb();
  if (!db) {
    return memoryCategories;
  }
  return db.collection<CategoryDocument>('categories').find({}).toArray();
}

export const listCategories = findCategories;

export async function ensureCategory(slug: string, name?: string): Promise<CategoryDocument> {
  const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const db = await getMongoDb();
  if (!db) {
    const existing = memoryCategories.find((c) => c.slug === normalized || c._id === `cat-${normalized}`);
    if (existing) return existing;
    const created: CategoryDocument = {
      _id: `cat-${normalized}`,
      slug: normalized,
      name: name?.trim() || normalized,
      description: `Auto-created category ${normalized}`,
    };
    memoryCategories.push(created);
    return created;
  }
  const id = `cat-${normalized}`;
  await db.collection<CategoryDocument>('categories').updateOne(
    { _id: id },
    { $setOnInsert: { _id: id, slug: normalized, name: name?.trim() || normalized, description: `Auto-created category ${normalized}` } },
    { upsert: true }
  );
  const doc = await db.collection<CategoryDocument>('categories').findOne({ _id: id });
  if (!doc) throw new Error('CATEGORY_CREATE_FAILED');
  return doc;
}

export async function upsertProduct(doc: ProductDocument): Promise<ProductDocument> {
  const db = await getMongoDb();
  if (!db) {
    const idx = memoryProducts.findIndex((p) => p._id === doc._id);
    if (idx >= 0) {
      memoryProducts[idx] = { ...doc, updatedAt: new Date().toISOString() };
      return memoryProducts[idx];
    }
    const created = { ...doc, updatedAt: new Date().toISOString() };
    memoryProducts.push(created);
    return created;
  }
  await db.collection<ProductDocument>('products').updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
  const saved = await db.collection<ProductDocument>('products').findOne({ _id: doc._id });
  if (!saved) throw new Error('PRODUCT_UPSERT_FAILED');
  return saved;
}

