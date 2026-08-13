export interface ProductInput {
  sku: string;
  name: string;
  category?: string;
  color?: string;
  material?: string;
  price?: string;
  photoUrl: string;
  notes?: string;
}

export interface CsvShotIdea {
  sku: string;
  shotIdea: string;
}
