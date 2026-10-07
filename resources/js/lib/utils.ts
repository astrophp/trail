import { createCn } from 'cn/engine'
import tables from '@/lib/cn-tables'

/** Merges class names. The tables are compiled from our sources and theme by the `cn` Vite plugin. */
export const cn = createCn(tables)
