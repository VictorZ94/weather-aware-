import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'

type Props = {
  message: string
  // null when trying again would not help.
  onRetry: (() => void) | null
  retrying: boolean
}

export function ErrorAlert({ message, onRetry, retrying }: Props) {
  return (
    <Alert
      severity="error"
      action={
        onRetry && (
          <Button color="inherit" size="small" onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        )
      }
    >
      <AlertTitle>Trip could not be planned</AlertTitle>
      {message}
    </Alert>
  )
}
