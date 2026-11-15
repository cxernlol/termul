import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '../alert-dialog'

describe('AlertDialogAction press scale', () => {
  it('renders the confirm as the primary and Cancel as the outline secondary', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete file</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    )

    // The confirm is the primary chrome; Cancel is the outline secondary.
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-primary-fill')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('bg-control-fill')
  })
})
