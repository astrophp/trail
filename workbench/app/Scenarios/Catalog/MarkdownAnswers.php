<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;
use Workbench\App\Scenarios\Scenario;

class MarkdownAnswers extends Scenario
{
    protected string $title = 'Answers in markdown';

    protected string $description = 'A customer gets answers written in markdown: headings, lists, a table, code, links, an image, raw HTML, a redacted token and a very long answer.';

    public function supportsLive(): bool
    {
        // A live model will not write these exact answers.
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(self::formatted(), ['input_tokens' => 420, 'output_tokens' => 380]),
            FakeAnthropic::text(self::long(), ['input_tokens' => 910, 'output_tokens' => 2400]),
            FakeAnthropic::text('You are welcome. Order **NW-10517** ships _tomorrow_.', ['input_tokens' => 3400, 'output_tokens' => 14]),
        ]);

        $customer = Customers::priya();

        $first = (new AccountAssistant)->forUser($customer)->prompt('What is in order NW-10517, and how do I call the order API?');

        foreach (['Can you give me the full returns guide?', 'Thanks, that is all. *Really*.'] as $message) {
            (new AccountAssistant)->continue($first->conversationId, as: $customer)->prompt($message);
        }
    }

    private static function formatted(): string
    {
        return <<<'MD'
        ## Order NW-10517

        Your order is **being packed** and ships _within two business days_.

        | Item | Qty | Price |
        | :-- | :-: | --: |
        | Ridgeline rain shell | 1 | €129.00 |
        | Trail socks | 3 | €27.00 |
        | **Total** | | **€156.00** |

        ### Progress

        - [x] Payment received
        - [x] Stock reserved
        - [ ] Shipped

        1. Packing
        2. ~~Waiting for stock~~
        3. Handed to the carrier

        > Orders placed before noon usually leave the same day.

        ### Calling the order API

        Send your token in the `Authorization` header:

        ```bash
        curl https://api.northwind.test/orders/NW-10517 \
          -H "Authorization: Bearer nwtok_8f3a91c2d4e5b6a7f8091a2b3c4d5e6f"
        ```

        The response is JSON:

        ```json
        { "number": "NW-10517", "status": "packing" }
        ```

        ---

        See [the order page](https://shop.northwind.test/orders/NW-10517), or https://help.northwind.test for help.
        This [harmless-looking link](javascript:alert('hi')) is not followed.

        ![Photo of the rain shell](https://cdn.northwind.test/products/ridgeline.jpg)

        <script>alert('raw HTML stays text')</script> <b onmouseover="alert(1)">not bold</b>
        MD;
    }

    private static function long(): string
    {
        $sections = [];

        foreach (range(1, 24) as $step) {
            $sections[] = <<<MD
            ### Step {$step}: check the item

            Look at the item carefully before you send it back. Make sure the tags are attached, the
            item is clean, and every part that came in the box is with it. Items that are worn or
            washed may be refused.

            - Keep the receipt or the order number (`NW-10517`).
            - Pack it in the original box when you still have it.

            ```text
            RETURN NW-10517 / STEP {$step}
            ```
            MD;
        }

        return "# Returns guide\n\n".implode("\n\n", $sections)."\n\nThat is the whole guide.";
    }
}
