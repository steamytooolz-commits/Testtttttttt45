import { z } from 'zod';

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'mailinator.net',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'guerrillamail.net',
  '10minutemail.com',
  '10minutemail.net',
  'yopmail.com',
  'yopmail.net',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.net',
  'dispostable.com',
  'fakeinbox.com',
  'getairmail.com',
  'maildrop.cc',
  'mailnesia.com',
  'mintemail.com',
  'mytrashmail.com',
  'sharklasers.com',
  'spam4.me',
  'spambox.us',
  'spamcannon.com',
  'tempinbox.com',
  'tmpmail.org',
  'tmpmail.net',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'moakt.com',
  'mohmal.com',
  'emailondeck.com',
  'fake-mail.cf',
  'mailsac.com',
  'inboxkitten.com',
  'burnermail.io',
  '33mail.com',
  'e4ward.com',
  'gustr.com',
  'harakirimail.com',
  'incognitomail.org',
  'lovemeleaveme.com',
  'mailcatch.com',
  'maileater.com',
  'nomail2me.com',
  'pokemail.net',
  'spamgourmet.com',
  'teleworm.us',
  'veryrealemail.com',
  'zeroe.ml',
]);

export const RegistrationSchema = z.object({
  company_name: z.string().trim().min(2).max(255),
  contact_name: z.string().trim().min(2).max(255),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(255)
    .refine(
      (email) => {
        const at = email.lastIndexOf('@');
        if (at < 0) return false;
        return !DISPOSABLE_EMAIL_DOMAINS.has(email.slice(at + 1));
      },
      { message: 'Disposable email addresses are not accepted. Use your company email.' }
    ),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s\-()]{7,25}$/, 'Invalid phone number format')
    .refine((val) => (val.match(/\d/g) || []).length >= 7, 'Phone number must contain at least 7 digits'),
  address: z.object({
    street: z.string().trim().min(2).max(255),
    city: z.string().trim().min(2).max(100),
    province: z.string().trim().min(2).max(100),
    postal_code: z.string().trim().min(2).max(20),
  }),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  recaptcha_token: z.string().min(1).optional(),
  captcha_nonce: z.string().trim().min(1).max(128).optional(),
  captcha_solution: z.string().trim().min(1).max(64).optional(),
  website: z.string().max(255).optional(),
  is_existing_client: z.boolean().optional(),
});

export type RegistrationInput = z.infer<typeof RegistrationSchema>;

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1, 'Password is required'),
  recaptcha_token: z.string().min(1).optional(),
  captcha_nonce: z.string().trim().min(1).max(128).optional(),
  captcha_solution: z.string().trim().min(1).max(64).optional(),
  website: z.string().max(255).optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  recaptcha_token: z.string().min(1).optional(),
  captcha_nonce: z.string().trim().min(1).max(128).optional(),
  captcha_solution: z.string().trim().min(1).max(64).optional(),
  website: z.string().max(255).optional(),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const TwoFactorSchema = z.object({
  challenge_token: z.string().min(1, 'Challenge token is required'),
  totp_code: z.string().regex(/^\d{6}$/, 'TOTP code must be exactly 6 digits'),
});

export type TwoFactorInput = z.infer<typeof TwoFactorSchema>;

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z
    .string()
    .min(10, 'Password must be at least 10 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const AdminResetPasswordSchema = z.object({
  userId: z.coerce.number().int().positive(),
  tempPassword: z
    .string()
    .min(10)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

export type AdminResetPasswordInput = z.infer<typeof AdminResetPasswordSchema>;

export const StaffCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(['SALES_STAFF', 'ADMIN']),
});

export type StaffCreateInput = z.infer<typeof StaffCreateSchema>;

export const TierBasisSchema = z
  .record(z.string(), z.string().trim().regex(/^\d{1,10}\.\d{2}$/, 'Tier price must be a DECIMAL(12,2) string'))
  .refine((obj) => Object.keys(obj).length > 0 && Object.keys(obj).every((k) => k.trim().length > 0), {
    message: 'Tier basis must map at least one SKU to a price',
  });

export type TierBasisInput = z.infer<typeof TierBasisSchema>;

export const PriceTierCreateSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/, 'Tier code must be uppercase alphanumeric with underscores'),
  name: z.string().trim().min(2).max(255),
  basis: TierBasisSchema,
  active: z.boolean().optional().default(true),
});

export type PriceTierCreateInput = z.infer<typeof PriceTierCreateSchema>;

export const PriceTierUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/, 'Tier code must be uppercase alphanumeric with underscores').optional(),
  name: z.string().trim().min(2).max(255).optional(),
  basis: TierBasisSchema.optional(),
  active: z.boolean().optional(),
});

export type PriceTierUpdateInput = z.infer<typeof PriceTierUpdateSchema>;

export const CatalogQuerySchema = z.object({
  categoryRef: z.string().trim().max(100).optional(),
  paperWeight: z.string().trim().max(50).optional(),
  packCount: z.coerce.number().int().positive().max(100000).optional(),
  colour: z.string().trim().max(50).optional(),
});

export type CatalogQueryInput = z.infer<typeof CatalogQuerySchema>;

export const SkuParamSchema = z.object({
  sku: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid SKU format'),
});

export type SkuParamInput = z.infer<typeof SkuParamSchema>;

export const CartAddItemSchema = z.object({
  sku: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid SKU format'),
  qty: z.coerce.number().int().positive().max(100000, 'Exceeded maximum order quantity per line'),
});

export type CartAddItemInput = z.infer<typeof CartAddItemSchema>;

export const CartUpdateItemSchema = z.object({
  qty: z.coerce.number().int().min(0).max(100000, 'Exceeded maximum order quantity per line'),
});

export type CartUpdateItemInput = z.infer<typeof CartUpdateItemSchema>;

export const BulkOrderItemSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(64).regex(/^[A-Za-z0-9_-]+$/, 'Invalid SKU format'),
  qty: z.coerce.number().int().positive('Quantity must be a positive integer').max(100000, 'Exceeded maximum order quantity per line'),
  notes: z.string().trim().max(255).optional(),
});

export type BulkOrderItemInput = z.infer<typeof BulkOrderItemSchema>;

export const BulkOrderMatrixSchema = z.object({
  items: z.array(BulkOrderItemSchema).min(1, 'At least one item is required').max(500, 'Cannot process more than 500 items at once'),
});

export type BulkOrderMatrixInput = z.infer<typeof BulkOrderMatrixSchema>;

export const RequisitionTemplateCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(255, 'Name too long'),
  description: z.string().trim().max(1000).optional(),
  items: z.array(BulkOrderItemSchema).min(1, 'Template must contain at least one line item').max(500),
});

export type RequisitionTemplateCreateInput = z.infer<typeof RequisitionTemplateCreateSchema>;

export const RequisitionTemplateUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  items: z.array(BulkOrderItemSchema).min(1).max(500).optional(),
});

export const ProductImageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/.+\..+/.test(v) || v.startsWith('/product-images/'), {
    message: 'Image must be an http(s) URL or an uploaded /product-images/ path',
  });

export const ProductCreateSchema = z.object({
  sku: z.string().trim().toUpperCase().min(3).max(64).regex(/^[A-Z0-9_-]+$/, 'Invalid SKU format'),
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(2000).optional().default(''),
  category: z.string().trim().min(2).max(100),
  paperWeight: z.string().trim().max(50).optional(),
  packCount: z.coerce.number().int().positive().max(100000).optional(),
  colour: z.string().trim().max(50).optional(),
  imageUrl: ProductImageUrlSchema.optional(),
  active: z.boolean().optional().default(true),
  stockQty: z.coerce.number().int().min(0).max(1000000).optional().default(0),
  prices: z.record(z.string(), z.string().trim().regex(/^\d{1,10}\.\d{2}$/, 'Price must be a DECIMAL(12,2) string')).optional(),
});

export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;

export const ProductUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(2).max(100).optional(),
  paperWeight: z.string().trim().max(50).optional(),
  packCount: z.coerce.number().int().positive().max(100000).optional(),
  colour: z.string().trim().max(50).optional(),
  imageUrl: ProductImageUrlSchema.optional(),
  active: z.boolean().optional(),
  prices: z.record(z.string(), z.string().trim().regex(/^\d{1,10}\.\d{2}$/, 'Price must be a DECIMAL(12,2) string')).optional(),
});

export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;

export type RequisitionTemplateUpdateInput = z.infer<typeof RequisitionTemplateUpdateSchema>;

export const CustomPriceSchema = z.object({
  sku: z.string().trim().toUpperCase().min(3).max(64).regex(/^[A-Z0-9_-]+$/, 'Invalid SKU format'),
  unitPrice: z.string().trim().regex(/^\d{1,10}\.\d{2}$/, 'Price must be a DECIMAL(12,2) string'),
});

export type CustomPriceInput = z.infer<typeof CustomPriceSchema>;

export const CustomPriceImportSchema = z.object({
  prices: z.array(CustomPriceSchema).min(1).max(500),
});

export type CustomPriceImportInput = z.infer<typeof CustomPriceImportSchema>;

