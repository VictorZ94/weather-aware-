import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

export function LoadingOverlay({ message }: { message: string }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        bgcolor: 'rgba(255, 255, 255, 0.7)',
      }}
    >
      <CircularProgress />
      <Typography sx={{ fontWeight: 600 }}>{message}</Typography>
    </Box>
  )
}
