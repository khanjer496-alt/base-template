package expo.modules.smsreader

import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads SMS from the device inbox. The app must hold the READ_SMS runtime
 * permission before calling getInboxSms; the query returns an empty list
 * if the permission is missing rather than crashing.
 */
class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    AsyncFunction("getInboxSms") { sinceMs: Double, max: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val messages = mutableListOf<Map<String, Any>>()
      try {
        val cursor = context.contentResolver.query(
          Telephony.Sms.Inbox.CONTENT_URI,
          arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
          "${Telephony.Sms.DATE} >= ?",
          arrayOf(sinceMs.toLong().toString()),
          "${Telephony.Sms.DATE} DESC"
        )
        cursor?.use {
          val addressIdx = it.getColumnIndex(Telephony.Sms.ADDRESS)
          val bodyIdx = it.getColumnIndex(Telephony.Sms.BODY)
          val dateIdx = it.getColumnIndex(Telephony.Sms.DATE)
          while (it.moveToNext() && messages.size < max) {
            messages.add(
              mapOf(
                "address" to (it.getString(addressIdx) ?: ""),
                "body" to (it.getString(bodyIdx) ?: ""),
                "date" to it.getLong(dateIdx).toDouble()
              )
            )
          }
        }
      } catch (_: SecurityException) {
        // Permission not granted — return what we have (empty).
      }
      messages
    }
  }
}
