export const TAGS = [
  'Beauty',
  'Lifestyle',
  'Education',
  'Fitness',
  'Finance',
  'Food',
  'Travel',
  'Fashion',
  'Technology',
  'Business',
] as const;

export type Tag = (typeof TAGS)[number];