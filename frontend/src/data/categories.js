/* Expense categories — must match CATEGORIES in backend/app/schemas.py */
export const CATEGORIES = [
  { id: 'food', name: 'Food', color: '#74C365' },
  { id: 'transport', name: 'Transport', color: '#1E488F' },
  { id: 'load', name: 'Load & Internet', color: '#DBE64C' },
  { id: 'bills', name: 'Bills', color: '#00804C' },
  { id: 'school', name: 'School / Work', color: '#7FA3D9' },
  { id: 'wants', name: 'Wants', color: '#F2A93B' },
  { id: 'others', name: 'Others', color: '#8D96A0' },
];

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.at(-1);
