export type ProductStatus = "Active" | "Inactive" | "Draft";

export interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price: string;
  costPrice?: string;
  wholesalePrice?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  description?: string;
  thumbnail?: string;
  status: ProductStatus;
  openingStock?: string;
  stockAlertQty?: string;
  unit?: string;
  tags?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
