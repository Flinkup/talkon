import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ORGANIZATION_ID } from '../lib/constants'

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  role: null,
  canEdit: false,
  isAdmin: false,
  signOut: async () => {},
})

const EDITOR_ROLES = ['owner', 'admin', 'editor']
const ADMIN_ROLES = ['owner', 'admin']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(null)

  useEffect(() => {
    let active = true

    // Load any persisted session on first mount.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    // Keep in sync with sign-in / sign-out / token refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Fetch the current user's role in TalkOn whenever the user changes.
  const userId = session?.user?.id
  useEffect(() => {
    let active = true
    if (!userId) {
      setRole(null)
      return
    }
    supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', ORGANIZATION_ID)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setRole(data?.role ?? null)
      })
    return () => {
      active = false
    }
  }, [userId])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      role,
      canEdit: EDITOR_ROLES.includes(role),
      isAdmin: ADMIN_ROLES.includes(role),
      signOut: () => supabase.auth.signOut(),
    }),
    [session, loading, role],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
