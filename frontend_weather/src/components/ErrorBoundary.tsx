import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { title: string; children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          <AlertTitle>{this.props.title}</AlertTitle>
          Reload the page to try again.
        </Alert>
      </Box>
    )
  }
}
