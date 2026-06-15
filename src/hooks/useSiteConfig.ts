import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useSiteConfig(key: string) {
  return useQuery({
    queryKey: ['site_config', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_config')
        .select('value')
        .eq('key', key)
        .single()
      if (error) throw new Error(error.message)
      return data.value
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateSiteConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { data, error } = await supabase
        .from('site_config')
        .update({ value })
        .eq('key', key)
        .select('key')   // force return — empty means RLS blocked

      if (error) throw new Error(error.message)

      if (!data || data.length === 0) {
        throw new Error('Save failed — RLS may be blocking the update. Check that you are logged in as super_admin.')
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['site_config', variables.key] })
    },
  })
}
