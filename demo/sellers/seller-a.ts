import type { AgentCard } from '@a2a-js/sdk';
import { startMockServer, type Product } from './shared/mock-server.ts';

const PRODUCTS: Product[] = [
  {
    name: 'Sony WH-1000XM5',
    price: 279.99,
    currency: 'USD',
    rating: 4.8,
    description: 'Premium wireless noise-canceling headphones with exceptional sound quality and 30-hour battery life.',
  },
  {
    name: 'Sony WF-1000XM5',
    price: 229.99,
    currency: 'USD',
    rating: 4.7,
    description: 'True wireless noise-canceling earbuds with Hi-Res Audio and IPX4 water resistance.',
  },
  {
    name: 'Sony WH-CH720N',
    price: 99.99,
    currency: 'USD',
    rating: 4.4,
    description: 'Lightweight wireless noise-canceling headphones with Dual Noise Sensor technology.',
  },
  {
    name: 'JBL Tour One M2',
    price: 249.99,
    currency: 'USD',
    rating: 4.6,
    description: 'Wireless over-ear noise-canceling headphones with Hi-Res Audio and spatial sound.',
  },
  {
    name: 'JBL Live 770NC',
    price: 149.99,
    currency: 'USD',
    rating: 4.5,
    description: 'Wireless over-ear noise-canceling headphones with 65-hour battery and multi-point connection.',
  },
  {
    name: 'JBL Tune 770NC',
    price: 79.99,
    currency: 'USD',
    rating: 4.3,
    description: 'Affordable wireless noise-canceling headphones with Pure Bass sound and 44-hour battery.',
  },
];

function searchProducts(query: string): Product[] {
  const keywords = query.toLowerCase().split(/\s+/);
  return PRODUCTS.filter((product) => {
    const text = `${product.name} ${product.description}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
}

const port = Number(process.env.PORT) || 4001;
const publicUrl = process.env.PUBLIC_URL || `http://0.0.0.0:${port}`;

const card: AgentCard = {
  name: 'CrewAI Electronics Store',
  description: 'A CrewAI-powered electronics store specializing in Sony and JBL audio products.',
  url: `${publicUrl}/a2a/jsonrpc`,
  version: '1.0.0',
  capabilities: {},
  skills: [
    {
      id: 'electronics-search',
      name: 'Electronics Search',
      description: 'Search Sony and JBL headphones and earbuds by keyword.',
      tags: ['electronics', 'headphones', 'sony', 'jbl', 'audio'],
      examples: ['wireless noise-canceling headphones', 'Sony earbuds', 'JBL over-ear'],
    },
  ],
};

startMockServer({ card, searchHandler: searchProducts, port });
