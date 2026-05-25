export type ProductStatus = "Active" | "Inactive" | "Draft";

export interface ProductVariant {
  id: string;
  attributes: Record<string, string>;
  price: string;
  image?: string;
  sku?: string;
  barcode?: string;
  stock?: string;
}

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
  showOnWeb?: boolean;
  websitePrice?: string;
  websitePriceWas?: string;
  clubcardPrice?: string;
  clubcardBogo?: boolean;
  condition?: string;
  productAttributes?: string[];
  variants?: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariant?: ProductVariant;
}
