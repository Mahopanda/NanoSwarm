import type { AgentCard } from '@a2a-js/sdk';
import { startMockServer, type Product } from './shared/mock-server.ts';

const PRODUCTS: Product[] = [
  {
    name: 'AKG N9 Hybrid',
    price: 299.99,
    currency: 'USD',
    rating: 4.7,
    description: 'Premium wireless noise-canceling headphones with studio-quality sound and 60-hour battery.',
  },
  {
    name: 'AKG K371-BT',
    price: 129.99,
    currency: 'USD',
    rating: 4.5,
    description: 'Closed-back wireless Bluetooth headphones with reference studio sound and foldable design.',
  },
  {
    name: 'AKG N700NC M2',
    price: 199.99,
    currency: 'USD',
    rating: 4.4,
    description: 'Adaptive noise-canceling wireless headphones with ambient aware mode and 23-hour battery.',
  },
  {
    name: 'Jabra Elite 85h',
    price: 179.99,
    currency: 'USD',
    rating: 4.6,
    description: 'SmartSound wireless noise-canceling headphones with 36-hour battery and rain-resistant design.',
  },
  {
    name: 'Jabra Elite 45h',
    price: 69.99,
    currency: 'USD',
    rating: 4.3,
    description: 'Compact wireless on-ear headphones with 50-hour battery and customizable EQ.',
  },
  {
    name: 'Jabra Elite 10',
    price: 249.99,
    currency: 'USD',
    rating: 4.8,
    description: 'True wireless earbuds with Dolby Atmos spatial sound and advanced noise cancellation.',
  },
];

function recommendProducts(query: string): Product[] {
  const keywords = query.toLowerCase().split(/\s+/);
  const matches = PRODUCTS.filter((product) => {
    const text = `${product.name} ${product.description}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
  // Sort by rating descending, return top 3
  return matches.sort((a, b) => b.rating - a.rating).slice(0, 3);
}

const port = Number(process.env.PORT) || 4002;
const publicUrl = process.env.PUBLIC_URL || `http://0.0.0.0:${port}`;

const card: AgentCard = {
  name: 'LangGraph Product Advisor',
  description: 'A LangGraph-powered product advisor specializing in AKG and Jabra audio equipment. Returns top recommendations by rating.',
  url: `${publicUrl}/a2a/jsonrpc`,
  version: '1.0.0',
  capabilities: {},
  skills: [
    {
      id: 'product-recommendation',
      name: 'Product Recommendation',
      description: 'Get top-rated AKG and Jabra headphones and earbuds recommendations by keyword.',
      tags: ['audio', 'headphones', 'akg', 'jabra', 'recommendations'],
      examples: ['wireless noise-canceling headphones', 'AKG studio headphones', 'Jabra earbuds'],
    },
  ],
};

startMockServer({ card, searchHandler: recommendProducts, port });
