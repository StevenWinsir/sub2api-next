import * as React from 'react'
import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { t } from '@/i18n'

export function NotFoundContent() {
  return (
    <div className="mx-auto max-w-xl py-24" data-testid="not-found">
      <EmptyState
        icon={FileQuestion}
        title={t('ui.notFound.title')}
        description={t('ui.notFound.description')}
        action={
          <Button asChild>
            <Link href="/home">{t('ui.notFound.backHome')}</Link>
          </Button>
        }
      />
    </div>
  )
}
