

export async function up(db) {

  const categoriesList = await db.listCollections({ name: 'categories' }).toArray();
  if (categoriesList.length === 0) {
    await db.createCollection('categories');
  }
  await db.collection('categories').createIndex({ slug: 1 }, { unique: true });

  const productsList = await db.listCollections({ name: 'products' }).toArray();
  if (productsList.length === 0) {
    await db.createCollection('products');
  }
  await db.collection('products').createIndex({ categoryRef: 1 });
  await db.collection('products').createIndex({ active: 1 });
  await db.collection('products').createIndex({ 'attributes.paperWeight': 1 });
  await db.collection('products').createIndex({ 'attributes.packCount': 1 });
  await db.collection('products').createIndex({ 'attributes.colour': 1 });
}
