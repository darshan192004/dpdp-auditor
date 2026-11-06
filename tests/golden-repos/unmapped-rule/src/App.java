// Golden fixture: this registry rule is absent from rules.md section 6.2 mappings,
// so the finding lands in the unmapped bucket (section 7.4) and does not affect scoring.
import java.security.MessageDigest;

public class App {
  String digest(String input) throws Exception {
    return new String(MessageDigest.getInstance("MD5").digest(input.getBytes()));
  }
}
